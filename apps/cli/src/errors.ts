export class UpgradeRequiredError extends Error {
  constructor(
    message: string,
    public readonly minVersion: string | null,
    public readonly currentVersion: string | null
  ) {
    super(message);
    this.name = 'UpgradeRequiredError';
  }
}
