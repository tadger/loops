// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../src/ConfirmDialog";
import "./dialog-stub";

afterEach(cleanup);

function setup(open: boolean) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const ui = (isOpen: boolean) => (
    <ConfirmDialog open={isOpen} title="Remove bar 2?" confirmLabel="Remove bar" onConfirm={onConfirm} onCancel={onCancel}>
      Bar 2 has 7 steps.
    </ConfirmDialog>
  );
  const view = render(ui(open));
  const dialog = () => view.container.querySelector("dialog")!;
  return { onConfirm, onCancel, dialog, rerender: (isOpen: boolean) => view.rerender(ui(isOpen)) };
}

describe("ConfirmDialog", () => {
  it("is closed until open is true, then opens as a modal", () => {
    const { dialog, rerender } = setup(false);
    expect(dialog().hasAttribute("open")).toBe(false);
    rerender(true);
    expect(dialog().hasAttribute("open")).toBe(true);
  });

  it("labels the dialog with its title and shows the body, a Cancel button and the confirm button", () => {
    const { dialog } = setup(true);
    const named = screen.getByRole("dialog", { name: "Remove bar 2?" });
    expect(named).toBe(dialog());
    expect(named.classList.contains("topcoat-dialog")).toBe(true);
    expect(screen.getByText("Remove bar 2?").classList.contains("topcoat-dialog__title")).toBe(true);
    expect(screen.getByText("Bar 2 has 7 steps.").classList.contains("topcoat-dialog__body")).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" }).classList.contains("topcoat-button")).toBe(true);
    expect(screen.getByRole("button", { name: "Remove bar" }).classList.contains("topcoat-button--cta")).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" }).closest(".topcoat-dialog__actions")).not.toBeNull();
  });

  it("focuses Cancel when it opens", () => {
    const { rerender } = setup(false);
    rerender(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("calls onConfirm for the confirm button and onCancel for Cancel, once each", () => {
    const { onConfirm, onCancel } = setup(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove bar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel once when the dialog closes itself (Escape)", () => {
    const { onCancel, dialog } = setup(true);
    dialog().close();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel when the parent closes it by setting open to false", () => {
    const { onCancel, dialog, rerender } = setup(true);
    rerender(false);
    expect(dialog().hasAttribute("open")).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
