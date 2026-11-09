import type { ComponentType } from "react";
import type { AdapterReviewProps } from "./adapter-review-types";
import { CutoverReview } from "./cutover-review";
import { GenericReviewSection } from "./generic-review-section";

/**
 * Component duyệt riêng theo tên adapter (`ImportRun.adapter`). Adapter có `review` với payload riêng
 * đăng ký thêm một mục (component client, nhận `AdapterReviewProps`), ví dụ:
 *   "vat-tu-chuyen-doi": CutoverReview,
 * Adapter không đăng ký → `GenericReviewSection`.
 */
export const adapterReviewComponents: Readonly<Record<string, ComponentType<AdapterReviewProps>>> = {
  "vat-tu-chuyen-doi": CutoverReview,
};

/** Hiển thị phần duyệt của run bằng component đã đăng ký cho adapter, hoặc phần mặc định. */
export function AdapterReviewSection(props: AdapterReviewProps) {
  const Registered = Object.hasOwn(adapterReviewComponents, props.adapterName)
    ? adapterReviewComponents[props.adapterName]
    : GenericReviewSection;
  return <Registered {...props} />;
}
