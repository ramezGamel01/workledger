import { render, screen } from "@testing-library/react";

import { App } from "@/App";
import { database } from "@/db/database";

describe("App", () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
  });

  afterEach(async () => {
    await database.delete();
  });

  it("opens the WorkLedger dashboard and first-run setup", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /Good (morning|afternoon|evening)/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Build your billing foundation"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Timer" })).toBeInTheDocument();
  });
});
