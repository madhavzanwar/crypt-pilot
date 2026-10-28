import { DBService } from './db.service';

export type RateLimitConfig = {
    limit: number; // Max requests allowed
    window: number; // Time window in seconds
};

export class RateLimitService {
    private dbService: DBService;
    private action: string;
    private config: RateLimitConfig;

    constructor(dbService: DBService, action: string, config: RateLimitConfig) {
        this.dbService = dbService;
        this.action = action;
        this.config = config;
    }

    /**
     * Checks if the rate limit has been exceeded for a given identifier.
     * @param identifier - A unique identifier (e.g., user ID, email, IP address).
     * @returns True if the request is allowed, false otherwise.
     */
    async isAllowed(identifier: string): Promise<boolean> {
        const now = Date.now();
        const windowStart = now - this.config.window * 1000;

        const recentRequests = await this.dbService.getRateLimitRequests(
            this.action,
            identifier,
            windowStart
        );

        return recentRequests.length < this.config.limit;
    }

    /**
     * Records a new request for a given identifier.
     * @param identifier - A unique identifier (e.g., user ID, email, IP address).
     */
    async recordRequest(identifier: string): Promise<void> {
        await this.dbService.addRateLimitRequest(this.action, identifier);
    }
}