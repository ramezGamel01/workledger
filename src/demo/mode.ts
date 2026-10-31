/**
 * The public demo runs the same app with sample data kept only in the
 * visitor's browser. Cloud sync is off and nothing leaves the device.
 */
export const isDemo = import.meta.env.VITE_WORKLEDGER_DEMO === "true";
