import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities/analyze-frame-activity';
import path from 'path';

// Create worker for Lambda environment
export async function createWorker() {
  // Use environment variables for configuration
  const temporalAddress = process.env.TEMPORAL_ADDRESS!;
  const temporalNamespace = process.env.TEMPORAL_NAMESPACE || 'default';
  const temporalTaskQueue = process.env.TEMPORAL_TASK_QUEUE || 'padlox-task-queue';
  
  // Create connection options
  const connectionOptions: any = {
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
  const connection = await NativeConnection.connect(connectionOptions);
  
  // Create the worker
  const worker = await Worker.create({
    connection,
    namespace: temporalNamespace,
    taskQueue: temporalTaskQueue,
    workflowsPath: path.join(__dirname, 'workflows'),
    activities,
    // Keep worker lightweight for Lambda
    maxConcurrentActivityTaskExecutions: 10,
    maxConcurrentWorkflowTaskExecutions: 10,
  });
  
  return worker;
} 