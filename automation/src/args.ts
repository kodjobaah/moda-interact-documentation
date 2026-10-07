export type CliArgs = {
  command: string | undefined;
  options: Record<string, string | boolean>;
};

export function parseCliArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token?.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token ?? ''}`);
    }

    const raw = token.slice(2);
    const equalsIndex = raw.indexOf('=');
    if (equalsIndex >= 0) {
      options[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }

    const next = rest[index + 1];
    if (next && !next.startsWith('--')) {
      options[raw] = next;
      index += 1;
    } else {
      options[raw] = true;
    }
  }

  return { command, options };
}

export function stringOption(
  options: Record<string, string | boolean>,
  name: string,
): string | undefined {
  const value = options[name];
  return typeof value === 'string' ? value : undefined;
}

export function booleanOption(
  options: Record<string, string | boolean>,
  name: string,
): boolean {
  return options[name] === true;
}
