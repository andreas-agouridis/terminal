import {
  type BoxOptions,
  BoxRenderable,
  OptimizedBuffer,
  type RenderContext,
  RGBA,
  TextAttributes,
} from "@opentui/core";
import { extend } from "@opentui/react";
import { Option } from "effect";

export interface SectionNav<T> {
  page: T;
  key: string;
}

export interface Section<T> {
  label: string;
  nav: Option.Option<SectionNav<T>>;
  attributes?: number;
}

interface PrettyHeaderOptions<T> extends BoxOptions {
  selected: T;
  sections: Section<T>[];
}

const topleft = "┌";
const topright = "┐";
const bottomleft = "└";
const bottomright = "┘";
const topJoin = "┬";
const bottomJoin = "┴";
const vertical = "│";
const horizontal = "─";

// Create custom component class
class PrettyHeaderRenderable<T> extends BoxRenderable {
  selected: T;
  sections: Section<T>[];

  constructor(ctx: RenderContext, options: PrettyHeaderOptions<T>) {
    super(ctx, {
      border: true,
      borderColor: "orange",
      minHeight: 3,
      ...options,
    });

    this.sections = options.sections;
    this.selected = options.selected;
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    super.renderSelf(buffer);

    // Layout the sections vertically spaced out
    const width = this.width;
    const sections = this.sections;
    const sectionWidth = width / sections.length;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]!;
      const isSelected =
        Option.isSome(section.nav) && section.nav.value.page == this.selected;

      let header = section.label;
      if (Option.isSome(section.nav)) {
        header = `[${section.nav.value.key}] ${header}`;
      }

      let attrs = section.attributes ?? TextAttributes.DIM;
      if (isSelected) {
        attrs = attrs | TextAttributes.BOLD;
        attrs = attrs & ~TextAttributes.DIM;
      }

      buffer.drawText(
        header,
        this.x + sectionWidth * (i + 0.5) - header.length / 2,
        this.y + 1,
        RGBA.fromInts(255, 255, 255, 255),
        undefined,
        attrs,
      );

      if (i > 0) {
        // Draw the top divider, the bottom divider, and the vertical divider
        buffer.drawText(
          topJoin,
          this.x + sectionWidth * i,
          this.y,
          this.borderColor,
        );
        buffer.drawText(
          bottomJoin,
          this.x + sectionWidth * i,
          this.y + this.height - 1,
          this.borderColor,
        );
        buffer.drawText(
          vertical,
          this.x + sectionWidth * i,
          this.y + 1,
          this.borderColor,
        );
      }
    }
  }
}

// Add TypeScript support
declare module "@opentui/react" {
  interface OpenTUIComponents {
    prettyHeader: typeof PrettyHeaderRenderable;
  }
}

// Register the component
extend({ prettyHeader: PrettyHeaderRenderable });
