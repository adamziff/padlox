import type { InferSelectModel } from 'drizzle-orm';
import {
    pgTable,
    varchar,
    timestamp,
    uuid,
    text,
    serial,
} from 'drizzle-orm/pg-core';

export const user = pgTable('User', {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    email: varchar('email', { length: 64 }).notNull(),
    password: varchar('password', { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const pendingRegistrations = pgTable('PendingRegistrations', {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    password: text('password').notNull(),
    otp: text('otp').notNull(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow()
});

export type PendingRegistrations = InferSelectModel<typeof pendingRegistrations>;
