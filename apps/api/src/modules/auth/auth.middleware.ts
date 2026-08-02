import jwt from "jsonwebtoken";
import type { Response, Request, NextFunction } from "express";
import dotenv from "dotenv";


dotenv.config();

const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
        // Tokens are always signed with a `{ userId }` object payload.
        req.user = decoded as { userId: string };
        next();
    } catch (error) {
        // console.error("error in auth middleware", error);
        // Return 403 or 401 if token is invalid or expired
        return res.status(403).json({ message: 'Invalid or expired token.' });
    }
};

export default authenticateToken;
