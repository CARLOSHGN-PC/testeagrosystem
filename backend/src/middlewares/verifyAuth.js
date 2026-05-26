import { authenticateJwtRequest } from './jwtAuthMiddleware.js';

export const verifyAuth = authenticateJwtRequest;
