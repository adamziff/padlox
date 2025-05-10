"use strict";
/**
 * A simple workflow that calls the sayHello activity
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.helloVideoWorkflow = helloVideoWorkflow;
const workflow_1 = require("@temporalio/workflow");
// Create a proxy to the activities
const { sayHello } = (0, workflow_1.proxyActivities)({
    startToCloseTimeout: '1 minute',
});
async function helloVideoWorkflow(name) {
    console.log(`[Workflow] Starting helloVideoWorkflow for ${name}`);
    // Call the sayHello activity
    const result = await sayHello(name);
    console.log(`[Workflow] Workflow completed with result: ${result}`);
    return result;
}
//# sourceMappingURL=hello-workflow.js.map