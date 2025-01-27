import 'server-only';

import { genSaltSync, hashSync } from 'bcrypt-ts';
import { desc, eq, } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
    user,
    type User,
    pendingRegistrations,
    type PendingRegistrations,
} from './schema';

export type DocumentKind = 'image' | 'video';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUser(email: string): Promise<Array<User>> {
    try {
        return await db.select().from(user).where(eq(user.email, email));
    } catch (error) {
        console.error('Failed to get user from database');
        throw error;
    }
}

export async function createUser(email: string, password: string, isHashed = false) {
    const finalPassword = isHashed ? password : hashSync(password, genSaltSync(10));

    try {
        return await db.insert(user).values({ email, password: finalPassword });
    } catch (error) {
        console.error('Failed to create user in database');
        throw error;
    }
}

export async function getPendingRegistration(email: string): Promise<PendingRegistrations | undefined> {
    console.log('Getting pending registration for', email);
    const result = await db
        .select()
        .from(pendingRegistrations)
        .where(eq(pendingRegistrations.email, email))
        .orderBy(desc(pendingRegistrations.createdAt))
        .limit(1);
    console.log(result);
    return result[0];
}

export async function createPendingRegistration({
    email,
    password,
    otp,
    expiresAt,
}: {
    email: string;
    password: string;
    otp: string;
    expiresAt: Date;
}) {
    try {
        return await db.insert(pendingRegistrations).values({
            email,
            password,
            otp,
            expiresAt,
        });
    } catch (error) {
        console.error('Failed to create pending registration in database');
        throw error;
    }
}
