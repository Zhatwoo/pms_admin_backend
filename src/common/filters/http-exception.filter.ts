import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: any = 'Internal server error';
    if (exception instanceof HttpException) {
      const resObj = exception.getResponse();
      if (typeof resObj === 'object' && resObj !== null && 'message' in resObj) {
        message = (resObj as any).message;
      } else {
        message = resObj;
      }
    } else {
      // Non-HttpException (e.g. database errors, unhandled exceptions)
      // Keep detailed message in server logs only, do not expose internal DB details to client
      message = 'Internal server error';
    }

    this.logger.error(
      `${request.method} ${request.url} -> ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    if (status === HttpStatus.UNAUTHORIZED) {
      response.status(status).json({
        statusCode: status,
        message:
          typeof message === 'string' && message.trim()
            ? message
            : 'Unauthorized request',
      });
      return;
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}

