// Minimal interface to ensure both database implementations have initialize()
export interface IDatabaseService {
  initialize(): Promise<void>;
  close(): void;
  [key: string]: any; // Allow other methods without strict typing
}
