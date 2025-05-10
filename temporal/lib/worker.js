"use strict";
/**
 * Temporal worker that can execute our workflow
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const worker_1 = require("@temporalio/worker");
const helloActivities = __importStar(require("./activities/hello-activity"));
const frameAnalysisActivities = __importStar(require("./activities/analyze-frame-activity"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
// Load environment variables from the parent Next.js project
// This needs to happen before any activities are executed
const envPath = path.resolve(process.cwd(), '../.env.local');
dotenv.config({ path: envPath });
console.log(`Loading environment variables from: ${envPath}`);
console.log('Supabase URL configured:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Yes' : 'No');
console.log('Supabase service key configured:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Yes' : 'No');
// Register the namespace and worker
async function run() {
    console.log('Starting Padlox Temporal worker...');
    try {
        // Create the worker
        const worker = await worker_1.Worker.create({
            // Use a more reliable path resolution
            workflowsPath: path.resolve(__dirname, 'workflows'),
            activities: {
                ...helloActivities,
                ...frameAnalysisActivities
            },
            taskQueue: 'padlox-task-queue',
        });
        // Start listening to the task queue
        console.log('Worker connected, listening to task queue: padlox-task-queue');
        await worker.run();
    }
    catch (error) {
        console.error('Failed to start worker:', error);
        process.exit(1);
    }
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Worker shutting down...');
    process.exit(0);
});
//# sourceMappingURL=worker.js.map