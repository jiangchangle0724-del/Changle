// A group buy for the tests, with the rules the plan names as the first sample (docs/tuan.md): three
// pickup points, delivery from $98 in Vancouver and Burnaby and from $68 in Richmond, Friday
// evenings. The goods, prices and places are made up: a few counted things and one sold by weight.
import type { OfferBook } from "../src/engine/types";

/** A group buy as a merchant would send it (POST /tuan/api/my/shops/<slug>/offers). */
export const offerDoc = (closesAt: number) => ({
  title: "本周大米团 · 周五到货",
  note: "周三晚上截单，周五送货或自提。",
  closesAt,
  roster: "names",
  items: [
    { section: "米面", name: "五常大米 10kg", detail: "当季新米", price: 3800, unit: "bag", stock: 40_000 },
    { section: "米面", name: "东北珍珠米 15lb", price: 2250, unit: "bag" },
    { section: "米面", name: "黄小米 2lb", price: 880, unit: "pack", perBuyer: 2000 },
    { section: "蛋肉", name: "土鸡蛋 30 枚", price: 1350, unit: "box", stock: 10_000, allergens: "蛋" },
    { section: "蛋肉", name: "手切羊肉片", detail: "按磅称重", price: 1699, unit: "lb" },
  ],
  points: [
    { name: "温哥华西区", address: "下单后发具体门牌", hours: "周五 4–7pm" },
    { name: "大学区", address: "校区附近", hours: "周五 5–7pm" },
    { name: "本拿比", address: "铁道镇附近", hours: "周六 11am–1pm" },
  ],
  rules: [
    { label: "温哥华（Downtown 除外）", min: 9800, hours: "周五 6–9pm" },
    { label: "本拿比", min: 9800, hours: "周五 6–9pm" },
    { label: "列治文", min: 6800, hours: "周五 6–9pm" },
  ],
});

/** The same group buy as the server keeps it, for the tests of the rules alone. */
export function sampleBook(now: number): OfferBook {
  return {
    shop: { id: "sshop000001", slug: "rice-test", name: "大米团（测试）", kind: "leader", about: "", contact: "微信 rice-test", pay: "e-Transfer: pay@example.com", permit: "", status: "live" },
    offer: { id: "aaaa2222", shopId: "sshop000001", title: "本周大米团 · 周五到货", note: "", status: "open", closesAt: now + 86_400_000, roster: "names" },
    items: [
      { id: "rice", section: "米面", name: "五常大米 10kg", detail: "当季新米", photo: null, price: 3800, unit: "bag", step: 1000, stock: 40_000, perBuyer: null, sold: 0, allergens: "" },
      { id: "pearl", section: "米面", name: "东北珍珠米 15lb", detail: "", photo: null, price: 2250, unit: "bag", step: 1000, stock: null, perBuyer: null, sold: 0, allergens: "" },
      { id: "millet", section: "米面", name: "黄小米 2lb", detail: "", photo: null, price: 880, unit: "pack", step: 1000, stock: null, perBuyer: 2000, sold: 0, allergens: "" },
      { id: "eggs", section: "蛋肉", name: "土鸡蛋 30 枚", detail: "", photo: null, price: 1350, unit: "box", step: 1000, stock: 10_000, perBuyer: null, sold: 0, allergens: "蛋" },
      { id: "lamb", section: "蛋肉", name: "手切羊肉片", detail: "按磅称重", photo: null, price: 1699, unit: "lb", step: 500, stock: null, perBuyer: null, sold: 0, allergens: "" },
    ],
    points: [
      { id: "west", name: "温哥华西区", address: "", hours: "周五 4–7pm" },
      { id: "campus", name: "大学区", address: "", hours: "周五 5–7pm" },
      { id: "burnaby", name: "本拿比", address: "", hours: "周六 11am–1pm" },
    ],
    rules: [
      { id: "van", label: "温哥华（Downtown 除外）", min: 9800, fee: 0, hours: "周五 6–9pm" },
      { id: "bby", label: "本拿比", min: 9800, fee: 0, hours: "周五 6–9pm" },
      { id: "rmd", label: "列治文", min: 6800, fee: 0, hours: "周五 6–9pm" },
    ],
  };
}
