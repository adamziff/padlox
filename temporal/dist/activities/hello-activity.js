"use strict";
/**
 * A simple activity that logs a message
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sayHello = sayHello;
async function sayHello(name) {
    console.log(`[Activity] Hello, ${name}!`);
    return `Hello, ${name}!`;
}
//# sourceMappingURL=hello-activity.js.map