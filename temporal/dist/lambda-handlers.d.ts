import { Context, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
export declare function analyzeFrameHandler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult>;
export declare function workerHandler(event: any, context: Context): Promise<any>;
