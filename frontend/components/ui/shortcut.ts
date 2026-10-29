/** Platform-aware label for the command-palette shortcut. Pure (no React) so it can be unit-tested with plain node. */
export function isApplePlatform(platform: string | undefined, userAgent?: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform ?? "") || /Mac OS X|iPhone|iPad/i.test(userAgent ?? "");
}

export function shortcutLabel(apple: boolean): { keys: string[]; text: string } {
  return apple ? { keys: ["⌘", "K"], text: "⌘K" } : { keys: ["Ctrl", "K"], text: "Ctrl K" };
}
