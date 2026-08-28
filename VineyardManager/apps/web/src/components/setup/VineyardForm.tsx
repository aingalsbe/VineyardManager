import { createVineyardSchema, type Vineyard } from "@vineyard/shared";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  createVineyard,
  deleteVineyardLogo,
  fetchVineyardLogoBlob,
  updateVineyard,
  uploadVineyardLogo,
} from "@/lib/api";

type Values = {
  name: string;
  address: string;
  timezone: string;
};

function emptyValues(): Values {
  return {
    name: "",
    address: "",
    timezone: "America/Chicago",
  };
}

export function VineyardForm({
  vineyard,
  onSaved,
}: {
  vineyard: Vineyard | null;
  onSaved: () => Promise<void> | void;
}) {
  const titleId = useId();
  const [values, setValues] = useState<Values>(emptyValues);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const isEdit = vineyard !== null;

  useEffect(() => {
    setValues(
      vineyard
        ? {
            name: vineyard.name,
            address: vineyard.address,
            timezone: vineyard.timezone,
          }
        : emptyValues(),
    );
    setFieldErrors({});
    setFormError(null);
    setLogoFile(null);
    setLogoError(null);
  }, [vineyard]);

  useEffect(() => {
    if (logoFile) {
      const url = URL.createObjectURL(logoFile);
      setLogoPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    if (!vineyard?.hasLogo) {
      setLogoPreview(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    void fetchVineyardLogoBlob(vineyard.id)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setLogoPreview(url);
      })
      .catch(() => {
        if (!cancelled) setLogoPreview(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [logoFile, vineyard?.id, vineyard?.hasLogo]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    const parsed = createVineyardSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      setSaving(false);
      return;
    }
    try {
      if (isEdit) {
        await updateVineyard(vineyard.id, parsed.data);
      } else {
        await createVineyard(parsed.data);
      }
      await onSaved();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : "Could not save the vineyard",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onUploadLogo() {
    if (!vineyard || !logoFile) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      await uploadVineyardLogo(vineyard.id, logoFile);
      setLogoFile(null);
      await onSaved();
    } catch (error) {
      setLogoError(
        error instanceof ApiError ? error.message : "Could not upload the logo",
      );
    } finally {
      setLogoBusy(false);
    }
  }

  async function onRemoveLogo() {
    if (!vineyard) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      await deleteVineyardLogo(vineyard.id);
      setLogoFile(null);
      await onSaved();
    } catch (error) {
      setLogoError(
        error instanceof ApiError ? error.message : "Could not remove the logo",
      );
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle id={titleId}>
        {isEdit ? "Vineyard" : "Create vineyard"}
      </CardTitle>
      <CardDescription>
        {isEdit
          ? "Name, address, and timezone for weather and the calendar later."
          : "Add the property first. Rows, tasks, and the dashboard use this vineyard."}
      </CardDescription>
      <form className="mt-4 space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <div>
          <Label htmlFor="vineyard-name">Name</Label>
          <Input
            id="vineyard-name"
            value={values.name}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
            disabled={saving}
            required
          />
          {fieldErrors.name ? (
            <p className="mt-1 text-sm text-health-red">{fieldErrors.name}</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="vineyard-address">Address</Label>
          <Textarea
            id="vineyard-address"
            value={values.address}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                address: event.target.value,
              }))
            }
            disabled={saving}
            rows={3}
            required
          />
          {fieldErrors.address ? (
            <p className="mt-1 text-sm text-health-red">{fieldErrors.address}</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="vineyard-timezone">Timezone</Label>
          <Input
            id="vineyard-timezone"
            value={values.timezone}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                timezone: event.target.value,
              }))
            }
            disabled={saving}
            required
          />
          {fieldErrors.timezone ? (
            <p className="mt-1 text-sm text-health-red">{fieldErrors.timezone}</p>
          ) : null}
        </div>
        {formError ? (
          <p className="text-sm font-medium text-health-red" role="alert">
            {formError}
          </p>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save vineyard" : "Create vineyard"}
        </Button>
      </form>

      {isEdit ? (
        <div className="mt-6 border-t border-border pt-4">
          <p className="font-medium">Logo</p>
          <p className="mt-1 text-sm text-muted">
            PNG, JPEG, or WebP, up to 1 MB. Shown at the top of every page.
          </p>
          {logoPreview ? (
            <img
              src={logoPreview}
              alt="Vineyard logo preview"
              className="mt-3 h-12 max-w-[16rem] object-contain"
            />
          ) : null}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="vineyard-logo">Image file</Label>
              <Input
                id="vineyard-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={logoBusy}
                onChange={(event) => {
                  setLogoFile(event.target.files?.[0] ?? null);
                  setLogoError(null);
                }}
              />
            </div>
            <Button
              type="button"
              disabled={logoBusy || !logoFile}
              onClick={() => void onUploadLogo()}
            >
              {logoBusy ? "Working…" : vineyard.hasLogo ? "Replace logo" : "Upload logo"}
            </Button>
            {vineyard.hasLogo ? (
              <Button
                type="button"
                variant="outline"
                disabled={logoBusy}
                onClick={() => void onRemoveLogo()}
              >
                Remove logo
              </Button>
            ) : null}
          </div>
          {logoError ? (
            <p className="mt-2 text-sm font-medium text-health-red" role="alert">
              {logoError}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
