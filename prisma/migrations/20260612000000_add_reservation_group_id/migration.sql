-- AlterTable
ALTER TABLE `reservations` ADD COLUMN `reservation_group_id` VARCHAR(255) NULL;

-- CreateIndex
CREATE INDEX `idx_reservation_group` ON `reservations`(`reservation_group_id`);
