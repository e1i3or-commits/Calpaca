import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ApiError,
  evaluateRouting,
  getRoutingForm,
  type RoutingAnswers,
  type RoutingField,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ISSUE_TEXT: Record<string, string> = {
  missing: "This field is required.",
  not_an_option: "Pick one of the listed options.",
  invalid_email: "Enter a valid email address.",
  bad_type: "Unexpected answer shape — reload and try again.",
  unknown_field: "Unexpected answer — reload and try again.",
};

export function RoutingFormPage({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [fields, setFields] = useState<RoutingField[] | null>(null);
  const [answers, setAnswers] = useState<RoutingAnswers>({});
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRoutingForm(slug)
      .then((form) => {
        if (!cancelled) setFields(form.fields);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError && e.status === 404
            ? "This form doesn't exist."
            : "Could not reach the server.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  function setAnswer(key: string, value: string | string[]) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setIssues((i) => {
      if (!(key in i)) return i;
      const rest = { ...i };
      delete rest[key];
      return rest;
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    setIssues({});
    try {
      const result = await evaluateRouting(slug, answers);
      if (result.matched && result.eventTypeSlug) {
        // carry the normalized answers into the booking so they land on the row
        void navigate({
          to: "/book/$slug",
          params: { slug: result.eventTypeSlug },
          search: { answers: result.answers },
        });
        return;
      }
      setError("No booking page matches those answers. Reach out to us directly instead.");
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_answers" && e.issues) {
        setIssues(Object.fromEntries(e.issues.map((i) => [i.field, i.reason])));
      } else if (e instanceof ApiError) {
        setError(`Something went wrong (${e.code}).`);
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{slug.replace(/-/g, " ")}</CardTitle>
          <CardDescription>Answer a few questions and we'll route you to the right booking page.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

          {fields === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

          {fields && (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={answers[field.key]}
                  issue={issues[field.key]}
                  onChange={(v) => setAnswer(field.key, v)}
                />
              ))}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Checking…" : "Continue"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FieldInput({
  field,
  value,
  issue,
  onChange,
}: {
  field: RoutingField;
  value: string | string[] | undefined;
  issue?: string;
  onChange: (v: string | string[]) => void;
}) {
  const id = `rf-${field.key}`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>

      {(field.type === "text" || field.type === "email") && (
        <Input
          id={id}
          type={field.type === "email" ? "email" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "select" && (
        <select
          id={id}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {field.type === "multiselect" && (
        <div className="flex flex-col gap-1">
          {(field.options ?? []).map((opt) => {
            const selected = Array.isArray(value) ? value : [];
            const checked = selected.includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(checked ? selected.filter((v) => v !== opt) : [...selected, opt])
                  }
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}

      {issue && (
        <p className="text-xs text-destructive">{ISSUE_TEXT[issue] ?? "Check this answer."}</p>
      )}
    </div>
  );
}
