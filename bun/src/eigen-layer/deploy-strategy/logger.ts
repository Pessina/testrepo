import chalk from "chalk";

type LogLevel = "info" | "success" | "warn" | "error" | "debug";

/**
 * Logger utility for standardized, colored console output
 */
export class Logger {
  private static readonly PREFIX = {
    info: chalk.blue("ℹ INFO"),
    success: chalk.green("✓ SUCCESS"),
    warn: chalk.yellow("⚠ WARNING"),
    error: chalk.red("✖ ERROR"),
    debug: chalk.magenta("🔍 DEBUG"),
  };

  private static formatMessage(level: LogLevel, message: string): string {
    return `${this.PREFIX[level]} ${message}`;
  }

  /**
   * Log an info message
   */
  static info(message: string, ...args: any[]): void {
    console.log(this.formatMessage("info", message), ...args);
  }

  /**
   * Log a success message
   */
  static success(message: string, ...args: any[]): void {
    console.log(this.formatMessage("success", message), ...args);
  }

  /**
   * Log a warning message
   */
  static warn(message: string, ...args: any[]): void {
    console.log(this.formatMessage("warn", message), ...args);
  }

  /**
   * Log an error message
   */
  static error(message: string, ...args: any[]): void {
    console.error(this.formatMessage("error", message), ...args);
  }

  /**
   * Log a debug message (only when verbose=true)
   */
  static debug(message: string, ...args: any[]): void {
    if (globalThis.verbose) {
      console.log(this.formatMessage("debug", message), ...args);
    }
  }

  /**
   * Print a section header
   */
  static header(title: string): void {
    const line = "=".repeat(60);
    console.log(`\n${chalk.cyan(line)}`);
    console.log(`${chalk.cyan("  ")}${chalk.bold.white(title)}`);
    console.log(`${chalk.cyan(line)}\n`);
  }

  /**
   * Print a section divider
   */
  static divider(): void {
    console.log(chalk.cyan("-".repeat(60)));
  }

  /**
   * Print a key-value pair for structured data
   */
  static keyValue(key: string, value: any): void {
    console.log(`${chalk.cyan(key)}: ${value}`);
  }
}

// Add verbose property to globalThis
declare global {
  var verbose: boolean;
}

globalThis.verbose = false;
