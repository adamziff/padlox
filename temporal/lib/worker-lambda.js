"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWorker = createWorker;
const worker_1 = require("@temporalio/worker");
const activities = __importStar(require("./activities/analyze-frame-activity"));
const path_1 = __importDefault(require("path"));
// Create worker for Lambda environment
async function createWorker() {
    // Use environment variables for configuration
    const temporalAddress = process.env.TEMPORAL_ADDRESS;
    const temporalNamespace = process.env.TEMPORAL_NAMESPACE || 'default';
    const temporalTaskQueue = process.env.TEMPORAL_TASK_QUEUE || 'padlox-task-queue';
    // Create connection options
    const connectionOptions = {
        address: temporalAddress
    };
    // Add TLS configuration if provided
    if (process.env.TEMPORAL_SERVER_ROOT_CA_CERT) {
        connectionOptions.tls = {
            serverNameOverride: process.env.TEMPORAL_SERVER_NAME_OVERRIDE
        };
        // Add certificates if provided
        if (process.env.TEMPORAL_SERVER_ROOT_CA_CERT) {
            connectionOptions.tls.serverRootCACertificate =
                Buffer.from(process.env.TEMPORAL_SERVER_ROOT_CA_CERT, 'base64');
        }
        if (process.env.TEMPORAL_CLIENT_CERT && process.env.TEMPORAL_CLIENT_KEY) {
            // Note: These properties may vary based on Temporal version
            // Check latest Temporal docs for correct property names
            connectionOptions.tls.clientCertificate =
                Buffer.from(process.env.TEMPORAL_CLIENT_CERT, 'base64');
            connectionOptions.tls.clientPrivateKey =
                Buffer.from(process.env.TEMPORAL_CLIENT_KEY, 'base64');
        }
    }
    // Create connection to Temporal
    const connection = await worker_1.NativeConnection.connect(connectionOptions);
    // Create the worker
    const worker = await worker_1.Worker.create({
        connection,
        namespace: temporalNamespace,
        taskQueue: temporalTaskQueue,
        workflowsPath: path_1.default.join(__dirname, 'workflows'),
        activities,
        // Keep worker lightweight for Lambda
        maxConcurrentActivityTaskExecutions: 10,
        maxConcurrentWorkflowTaskExecutions: 10,
    });
    return worker;
}
//# sourceMappingURL=worker-lambda.js.map