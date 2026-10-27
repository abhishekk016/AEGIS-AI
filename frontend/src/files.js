/** True for files that are tests by common naming/location conventions. */
export function isTestFile(path) {
  return (
    /(^|\/)(tests?|__tests__|spec)\//i.test(path) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(path) ||
    /(^|\/)test_[^/]*\.py$/i.test(path) ||
    /_test\.py$/i.test(path)
  );
}
