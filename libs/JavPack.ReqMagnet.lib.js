/**
 * @require JavPack.Req.lib.js
 */

// eslint-disable-next-line no-unused-vars, unused-imports/no-unused-vars
class ReqMagnet extends Req {
  /**
   * @connect btdig.com
   */
  static btdig({ code, regex }) {
    return this.tasks(`https://btdig.com/search?order=0&q=${code}`, [
      (dom) => {
        return [...dom.querySelectorAll(".one_result")]
          .map((node) => {
            return {
              url: node.querySelector(".torrent_magnet a")?.href,
              name: node.querySelector(".torrent_name")?.textContent.trim() ?? "",
              size: node.querySelector(".torrent_size")?.textContent.replace(/\s/g, "") ?? "",
              files: node.querySelector(".torrent_files")?.textContent.trim() ?? "",
              date: (node.querySelector(".torrent_age")?.textContent ?? "").replace("found", "").trim(),
            };
          })
          .filter(({ url, name }) => url && regex.test(name));
      },
    ]);
  }

  /**
   * @connect nyaa.si
   */
  static nyaa({ code, regex }) {
    return this.tasks(`https://sukebei.nyaa.si/?f=0&c=2_2&q=${code}`, [
      (dom) => {
        return [...dom.querySelectorAll(".torrent-list tbody > tr")]
          .map((node) => {
            const [, name, link, size, date] = [...node.querySelectorAll("td")];
            return {
              url: link.querySelectorAll("a")?.[1]?.href,
              name: [...name.querySelectorAll("a")].at(-1)?.textContent.trim() ?? "",
              size: size?.textContent.replace(/\s/g, "") ?? "",
              date: (date?.textContent ?? "").split(" ")[0].trim(),
            };
          })
          .filter(({ url, name }) => url && regex.test(name));
      },
    ]);
  }

  /**
   * @connect u9a9.com
   */
  static u9a9({ code, regex }) {
    return this.tasks(`https://u9a9.com/?type=2&search=${code}`, [
      (dom) => {
        const parseRow = (node) => {
          const [, nameCell, linkCell, sizeCell, dateCell] = [...node.querySelectorAll("td")];
          const link = linkCell?.querySelector('a[href^="magnet:"]');

          return {
            url: link?.href,
            name: nameCell?.textContent.replace(/\s+/g, " ").trim() ?? "",
            size: sizeCell?.textContent.replace(/\s/g, "") ?? "",
            date: dateCell?.textContent.trim() ?? "",
          };
        };

        const parseLink = (link) => {
          const row = link.closest("tr, li, .item, .row, .card") || link.parentElement;
          const text = row?.textContent.replace(/\s+/g, " ").trim() || link.textContent.trim();
          const size = text.match(/\d+(?:\.\d+)?\s*(?:GB|MB|KB|TB|GiB|MiB|KiB|TiB)/i)?.[0]?.replace(/\s/g, "") || "";
          const date = text.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/)?.[0] || "";
          const name = (row?.querySelector('a:not([href^="magnet:"])')?.textContent || link.textContent || text)
            .replace(/\s+/g, " ")
            .trim();

          return {
            url: link.href,
            name,
            size,
            date,
          };
        };

        const rows = [...dom.querySelectorAll(".torrent-list tbody > tr")].map(parseRow);
        const fallback = rows.length ? [] : [...dom.querySelectorAll('a[href^="magnet:"]')].map(parseLink);

        return [...rows, ...fallback]
          .filter(({ url, name }) => url && regex.test(name));
      },
    ]);
  }
}
