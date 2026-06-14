import { type Ticket, ticketLines } from "./ticket";

/**
 * Minimal ESC/POS encoder — the de-facto command language of thermal receipt
 * printers. We emit the raw byte stream a printer understands: init, alignment,
 * emphasis, the ticket text, then a paper cut.
 *
 * Pure + dependency-free so it runs anywhere (server for network/cloud
 * transports, browser for Web Bluetooth) and is easy to unit-test.
 */

const ESC = 0x1b;
const GS = 0x1d;

class EscPosBuilder {
  private bytes: number[] = [];

  raw(...b: number[]): this {
    this.bytes.push(...b);
    return this;
  }

  /** Append text as bytes (ASCII/Latin-1; non-encodable chars become '?'). */
  text(s: string): this {
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      this.bytes.push(code <= 0xff ? code : 0x3f);
    }
    return this;
  }

  line(s = ""): this {
    return this.text(s).raw(0x0a);
  }

  init(): this {
    return this.raw(ESC, 0x40); // ESC @
  }
  align(a: "left" | "center" | "right"): this {
    return this.raw(ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0);
  }
  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  /** Double width+height when big=true (GS ! n). */
  size(big: boolean): this {
    return this.raw(GS, 0x21, big ? 0x11 : 0x00);
  }
  cut(): this {
    return this.raw(GS, 0x56, 0x00); // GS V 0 — full cut
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** Encodes a Ticket into an ESC/POS byte stream ready to send to a printer. */
export function encodeTicket(ticket: Ticket): Uint8Array {
  const b = new EscPosBuilder().init().align("center");

  // Header: restaurant + big table number.
  b.bold(true).line(ticket.restaurantName).bold(false);
  b.size(true).line(`TABLE ${ticket.tableNumber}`).size(false);

  b.align("left");
  // Body (skip the first two lines already printed as the header).
  for (const line of ticketLines(ticket).slice(2)) b.line(line);

  b.line().line().cut();
  return b.build();
}

/** Base64 of the ESC/POS stream — convenient for transport over JSON/HTTP. */
export function encodeTicketBase64(ticket: Ticket): string {
  return Buffer.from(encodeTicket(ticket)).toString("base64");
}
