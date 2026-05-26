import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import { Params } from 'nestjs-pino';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.accessToken',
  'req.body.code',
  'req.body.storePin',
  'res.headers["set-cookie"]',
];

const getRequestId = (req: IncomingMessage): string => {
  const incomingRequestId = req.headers['x-request-id'];

  if (Array.isArray(incomingRequestId)) {
    return incomingRequestId[0] ?? randomUUID();
  }

  return incomingRequestId || randomUUID();
};

export const createLoggerParams = (configService: ConfigService): Params => {
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const logLevel = configService.get<string>(
    'LOG_LEVEL',
    nodeEnv === 'test' ? 'silent' : 'info',
  );
  const isProduction = nodeEnv === 'production';

  return {
    pinoHttp: {
      level: logLevel,
      enabled: logLevel !== 'silent',
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const requestId = getRequestId(req);
        res.setHeader('x-request-id', requestId);
        return requestId;
      },
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
    },
  };
};
