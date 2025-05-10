"use strict";
/**
 * Simple script to run the workflow for testing
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("./client");
async function run() {
    try {
        const result = await (0, client_1.startHelloWorkflow)('Padlox');
        console.log(`Workflow execution completed with result: ${result}`);
    }
    catch (error) {
        console.error('Failed to run workflow:', error);
    }
}
// Run the workflow
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=run-workflow.js.map