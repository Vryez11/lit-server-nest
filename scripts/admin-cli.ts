/**
 * 관리자 계정 CLI (F-019). 가입 API가 없으므로 운영자가 서버에서 실행한다.
 *
 *   npm run admin -- create --email ops@example.com --name "운영팀"
 *   echo "$PW" | npm run admin -- create --email ops@example.com --password-stdin
 *   npm run admin -- reset-password --email ops@example.com
 *   npm run admin -- deactivate --email ops@example.com
 *   npm run admin -- activate --email ops@example.com
 *   npm run admin -- list
 *
 * 비밀번호는 프롬프트(입력 숨김) 또는 stdin으로만 받는다. 인자로 받지 않는다
 * (셸 히스토리에 남기 때문). Nest 컨테이너 없이 PrismaClient를 직접 쓴다.
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import * as readline from 'readline';
import { parseArgs } from 'util';

const SALT_ROUNDS = 10; // PasswordService와 동일
const MIN_PASSWORD_LENGTH = 8;

type Command = 'create' | 'reset-password' | 'deactivate' | 'activate' | 'list';

const COMMANDS: Command[] = [
  'create',
  'reset-password',
  'deactivate',
  'activate',
  'list',
];

// dotenv 없이 .env.local → .env 순으로 읽는다. 이미 설정된 변수는 덮지 않는다.
const loadEnvFiles = (): void => {
  for (const file of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), file);

    if (!existsSync(path)) {
      continue;
    }

    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line || line.startsWith('#')) {
        continue;
      }

      const eq = line.indexOf('=');

      if (eq <= 0) {
        continue;
      }

      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      const hashIndex = value.search(/\s#/);

      if (!/^["']/.test(value) && hashIndex >= 0) {
        value = value.slice(0, hashIndex).trim();
      }

      if (/^(['"]).*\1$/.test(value)) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
};

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
};

const promptHidden = (question: string): Promise<string> =>
  new Promise((resolvePrompt) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const mutable = rl as unknown as { _writeToOutput: (s: string) => void };
    const original = mutable._writeToOutput.bind(rl);

    process.stdout.write(question);
    mutable._writeToOutput = () => undefined;

    rl.question('', (answer) => {
      mutable._writeToOutput = original;
      process.stdout.write('\n');
      rl.close();
      resolvePrompt(answer);
    });
  });

const readPassword = async (fromStdin: boolean): Promise<string> => {
  if (fromStdin) {
    const password = await readStdin();

    if (password.length < MIN_PASSWORD_LENGTH) {
      return fail(`비밀번호는 최소 ${MIN_PASSWORD_LENGTH}자여야 합니다.`);
    }

    return password;
  }

  for (;;) {
    const first = await promptHidden('비밀번호: ');

    if (first.length < MIN_PASSWORD_LENGTH) {
      console.error(`비밀번호는 최소 ${MIN_PASSWORD_LENGTH}자여야 합니다.`);
      continue;
    }

    const second = await promptHidden('비밀번호 확인: ');

    if (first !== second) {
      console.error('두 입력이 일치하지 않습니다. 다시 입력하세요.');
      continue;
    }

    return first;
  }
};

const normalizeEmail = (email: string | undefined): string => {
  const value = email?.trim().toLowerCase();

  if (!value || !value.includes('@')) {
    return fail('--email <email> 옵션이 필요합니다.');
  }

  return value;
};

const main = async (): Promise<void> => {
  loadEnvFiles();

  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      'password-stdin': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });
  const command = positionals[0] as Command | undefined;

  if (!command || !COMMANDS.includes(command)) {
    fail(`사용법: npm run admin -- <${COMMANDS.join('|')}> [--email ...]`);
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    fail('DATABASE_URL이 설정되어 있지 않습니다.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl as string),
  });

  try {
    switch (command) {
      case 'create': {
        const email = normalizeEmail(values.email);
        const existing = await prisma.admins.findUnique({ where: { email } });

        if (existing) {
          fail(`이미 존재하는 관리자입니다: ${email}`);
        }

        const password = await readPassword(values['password-stdin']);
        const admin = await prisma.admins.create({
          data: {
            id: `adm_${randomUUID()}`,
            email,
            name: values.name?.trim() || null,
            password_hash: await bcrypt.hash(password, SALT_ROUNDS),
          },
        });

        console.log(`관리자 생성 완료: ${admin.email} (${admin.id})`);
        break;
      }
      case 'reset-password': {
        const email = normalizeEmail(values.email);
        const admin = await prisma.admins.findUnique({ where: { email } });

        if (!admin) {
          fail(`관리자를 찾을 수 없습니다: ${email}`);
        }

        const password = await readPassword(values['password-stdin']);

        await prisma.$transaction([
          prisma.admins.update({
            where: { id: admin!.id },
            data: {
              password_hash: await bcrypt.hash(password, SALT_ROUNDS),
              login_count: 0,
              login_locked_until: null,
              updated_at: new Date(),
            },
          }),
          prisma.admin_refresh_tokens.deleteMany({
            where: { admin_id: admin!.id },
          }),
        ]);

        console.log(`비밀번호 재설정 완료 (기존 세션 무효화): ${email}`);
        break;
      }
      case 'deactivate':
      case 'activate': {
        const email = normalizeEmail(values.email);
        const admin = await prisma.admins.findUnique({ where: { email } });

        if (!admin) {
          fail(`관리자를 찾을 수 없습니다: ${email}`);
        }

        const activate = command === 'activate';

        await prisma.$transaction([
          prisma.admins.update({
            where: { id: admin!.id },
            data: {
              is_active: activate,
              ...(activate ? { login_count: 0, login_locked_until: null } : {}),
              updated_at: new Date(),
            },
          }),
          // 비활성화 시 refresh 토큰을 지워 재발급을 막는다. access 토큰은
          // 가드가 매 요청 is_active를 확인하므로 즉시 거부된다.
          ...(activate
            ? []
            : [
                prisma.admin_refresh_tokens.deleteMany({
                  where: { admin_id: admin!.id },
                }),
              ]),
        ]);

        console.log(`${activate ? '활성화' : '비활성화'} 완료: ${email}`);
        break;
      }
      case 'list': {
        const rows = await prisma.admins.findMany({
          orderBy: { created_at: 'asc' },
          select: {
            id: true,
            email: true,
            name: true,
            is_active: true,
            last_login_at: true,
          },
        });

        if (rows.length === 0) {
          console.log('등록된 관리자가 없습니다.');
          break;
        }

        console.table(
          rows.map((row) => ({
            id: row.id,
            email: row.email,
            name: row.name ?? '',
            active: row.is_active ? 'Y' : 'N',
            lastLoginAt: row.last_login_at?.toISOString() ?? '',
          })),
        );
        break;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
