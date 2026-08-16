import { describe, expect, it } from "vitest";
import {
  Badge,
  Button,
  Card,
  DataList,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  FileDrop,
  FormField,
  Input,
  LoadingState,
  MetricCard,
  PageHeader,
  PageShell,
  Tabs,
  YuniIcon,
  yuniIcons,
  yuniTokens,
} from "./index";

describe("@yuni/ui", () => {
  it("exports design tokens", () => {
    expect(yuniTokens.colors.bg).toBe("#08030f");
    expect(yuniTokens.radius.md).toBe("8px");
  });

  it("exports base components", () => {
    expect(Button).toBeTypeOf("function");
    expect(Card).toBeTypeOf("function");
    expect(Input).toBeTypeOf("function");
    expect(FormField).toBeTypeOf("function");
    expect(PageShell).toBeTypeOf("function");
    expect(PageHeader).toBeTypeOf("function");
    expect(Tabs).toBeTypeOf("function");
    expect(FileDrop).toBeTypeOf("function");
    expect(EmptyState).toBeTypeOf("function");
    expect(LoadingState).toBeTypeOf("function");
    expect(ErrorState).toBeTypeOf("function");
    expect(MetricCard).toBeTypeOf("function");
    expect(DataList).toBeTypeOf("function");
    expect(Badge).toBeTypeOf("function");
    expect(Dialog).toBeTypeOf("object");
    expect(Drawer).toBeTypeOf("object");
    expect(YuniIcon).toBeTypeOf("function");
    expect(yuniIcons.add).toBeDefined();
  });
});
