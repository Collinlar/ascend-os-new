/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Old "New invoice" links (/documents?new=invoice) open the New document
  // page (round 2, R1). Done here because the list page streams, and a
  // redirect from a streamed page arrives too late to be a real one.
  async redirects() {
    return [
      {
        source: "/documents",
        has: [{ type: "query", key: "new", value: "(?<kind>[a-z_]+)" }],
        destination: "/documents/new?type=:kind",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
