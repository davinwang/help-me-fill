// The prebuilt mammoth browser bundle is UMD without shipped types; only the
// raw-text extraction surface is used, and it runs fully inside the sidebar.
declare module 'mammoth/mammoth.browser.min.js' {
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
  };
  export default mammoth;
}
