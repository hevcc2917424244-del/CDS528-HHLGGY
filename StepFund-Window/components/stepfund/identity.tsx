import type { Context } from "./shared";

/** Locally bundled, decorative brand artwork. Never used as project evidence. */
export function StepMark() {
  return (
    <img
      className="step-mark"
      src="/identity/step-mark.svg"
      width={42}
      height={42}
      alt=""
      aria-hidden="true"
    />
  );
}

export function ProgressPrint({ s }: { s: Context["s"] }) {
  return (
    <figure
      className="progress-print"
      aria-label={s("Fund, verify, release", "支持、验收、放款")}
    >
      <div className="print-heading">
        <span>{s("THE STEPFUND METHOD", "StepFund 的方式")}</span>
        <span aria-hidden="true">{s("FIG. 01", "图 01")}</span>
      </div>
      <img
        src="/identity/progress-print.svg"
        width={390}
        height={230}
        alt=""
        aria-hidden="true"
      />
      <figcaption>
        <span>
          <b>01</b>
          {s("Fund", "支持")}
        </span>
        <span>
          <b>02</b>
          {s("Verify", "验收")}
        </span>
        <span>
          <b>03</b>
          {s("Release", "放款")}
        </span>
      </figcaption>
    </figure>
  );
}

export function ProjectCover({ category }: { category: string }) {
  const art =
    category === "technology"
      ? "technology"
      : category === "education"
        ? "education"
        : "community";
  return (
    <img
      className="project-cover-image"
      src={`/identity/${art}-cover.png`}
      width={1536}
      height={1024}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
    />
  );
}

export function ActionArrow() {
  return (
    <img
      className="action-arrow"
      src="/identity/action-arrow.svg"
      width={25}
      height={25}
      alt=""
      aria-hidden="true"
    />
  );
}
