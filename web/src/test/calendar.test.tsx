import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { Calendar } from "@/components/ui/calendar";

describe("calendar smoke", () => {
  it("renders a month grid with day buttons", () => {
    render(<Calendar mode="single" defaultMonth={new Date(2026, 0, 1)} />);
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell").length).toBeGreaterThan(27);
  });
});
