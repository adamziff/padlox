/**
 * A simple activity that logs a message
 */

export async function sayHello(name: string): Promise<string> {
  console.log(`[Activity] Hello, ${name}!`);
  return `Hello, ${name}!`;
} 