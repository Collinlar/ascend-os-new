// Times a customer came: till sales, shop orders and bookings. Documents are
// paperwork about those, so they do not count again (Modules M5). Shared by
// the server page's figures and the client list.
export function visitsOf(c: { sales: number; orders: number; bookings: number }): number {
  return c.sales + c.orders + c.bookings;
}
