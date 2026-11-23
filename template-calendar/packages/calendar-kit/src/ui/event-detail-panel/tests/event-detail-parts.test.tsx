import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { englishTranslate as t } from "../../../i18n/english";
import { EventDetailContent } from "../event-detail-panel";
import type { EventDetailPanelProps } from "../event-detail-panel";
import {
  EventDetailDivider,
  EventDetailRow,
  EventDetailSection,
} from "../event-detail-sections";

const contentProps = (
  overrides: Partial<EventDetailPanelProps> = {}
): EventDetailPanelProps => ({
  direction: "ltr",
  event: timedEvent({ id: "sync", title: "Weekly sync" }),
  locale: "en-US",
  maxVisibleParticipants: 6,
  onClose: vi.fn(),
  open: true,
  t,
  timeZone: UTC,
  ...overrides,
});

describe("EventDetailContent", () => {
  it("renders the event inline as a region named by its title, with no dialog around it", () => {
    render(<EventDetailContent {...contentProps()} />);

    expect(screen.getByRole("region", { name: "Weekly sync" })).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders nothing when the controller is closed", () => {
    const { container } = render(
      <EventDetailContent {...contentProps({ open: false })} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("EventDetailSection", () => {
  it("renders its children inside a section group", () => {
    const { container } = render(
      <EventDetailSection className="host-group">
        <p>Room 4</p>
      </EventDetailSection>
    );

    expect(screen.getByText("Room 4")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("host-group");
  });

  it("renders an empty group when given no children, for the stylesheet to hide", () => {
    const { container } = render(<EventDetailSection />);

    expect(container.firstElementChild).toBeEmptyDOMElement();
  });
});

describe("EventDetailRow", () => {
  it("names the content with its label heading", () => {
    render(
      <EventDetailRow label="Location">
        <p>BG-Istanbul</p>
      </EventDetailRow>
    );

    expect(screen.getByRole("heading", { name: "Location" })).toBeInTheDocument();
    expect(screen.getByText("BG-Istanbul")).toBeInTheDocument();
  });

  it("renders content without a heading when no label is given", () => {
    render(
      <EventDetailRow>
        <p>Free text</p>
      </EventDetailRow>
    );

    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Free text")).toBeInTheDocument();
  });
});

describe("EventDetailDivider", () => {
  it("draws a decorative rule that assistive technology skips", () => {
    const { container } = render(<EventDetailDivider />);

    expect(container.querySelector('[role="separator"]')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
