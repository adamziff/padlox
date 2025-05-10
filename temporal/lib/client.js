"use strict";
/**
 * Temporal client for starting workflows
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = createClient;
exports.startHelloWorkflow = startHelloWorkflow;
exports.startFrameAnalysisWorkflow = startFrameAnalysisWorkflow;
const client_1 = require("@temporalio/client");
// Create a client connected to the Temporal server
async function createClient() {
    const connection = await client_1.Connection.connect({
        address: 'localhost:7233', // Default Temporal server address
    });
    return new client_1.Client({
        connection,
        namespace: 'default',
    });
}
// Helper function to start the hello workflow
async function startHelloWorkflow(name) {
    const client = await createClient();
    // Generate a unique ID for this workflow
    const workflowId = `hello-video-workflow-${Date.now()}`;
    try {
        console.log(`Starting workflow with ID: ${workflowId}`);
        // Start the workflow execution
        const handle = await client.workflow.start('helloVideoWorkflow', {
            args: [name],
            taskQueue: 'padlox-task-queue',
            workflowId,
        });
        console.log(`Started workflow with ID: ${workflowId}`);
        // Wait for the workflow to complete and return the result
        const result = await handle.result();
        console.log(`Workflow completed with result: ${result}`);
        return result;
    }
    catch (error) {
        console.error('Error starting workflow:', error);
        throw error;
    }
}
// Helper function to start the frame analysis workflow
async function startFrameAnalysisWorkflow(imageUrl) {
    const client = await createClient();
    // Generate a unique ID for this workflow
    const workflowId = `analyze-frame-${Date.now()}`;
    try {
        console.log(`Starting frame analysis workflow with ID: ${workflowId}`);
        // Start the workflow execution
        const handle = await client.workflow.start('analyzeFrame', {
            args: [{ imageUrl }],
            taskQueue: 'padlox-task-queue',
            workflowId,
        });
        console.log(`Started frame analysis workflow with ID: ${workflowId}`);
        // Wait for the workflow to complete and return the result
        const result = await handle.result();
        console.log(`Frame analysis workflow completed with ${result.itemIds.length} items identified`);
        console.log(`Message: ${result.message}`);
        return result.itemIds;
    }
    catch (error) {
        console.error('Error starting frame analysis workflow:', error);
        throw error;
    }
}
//# sourceMappingURL=client.js.map