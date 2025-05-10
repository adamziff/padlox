/**
 * Temporal client for starting workflows
 */
import { Client } from '@temporalio/client';
export declare function createClient(): Promise<Client>;
export declare function startHelloWorkflow(name: string): Promise<string>;
