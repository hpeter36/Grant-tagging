import { useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../api/client";
import { GrantsTable } from "./GrantsTable";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "./ui/form";

/**
 * Zod schema for the manual grant entry form.
 *
 * grant_name: Non-empty string for the grant title.
 * grant_description: Non-empty, reasonably sized string describing the grant.
 */
const GrantFormSchema = z.object({
  grant_name: z
    .string()
    .min(1, "Grant name is required.")
    .max(300, "Grant name is too long."),
  grant_description: z
    .string()
    .min(1, "Grant description is required.")
    .max(8000, "Grant description is too long."),
});

type GrantFormValues = z.infer<typeof GrantFormSchema>;

export function AdminTab() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [jsonUploadError, setJsonUploadError] = useState<string | null>(null);
  const [jsonUploadSuccess, setJsonUploadSuccess] = useState<string | null>(null);

  const formMethods = useForm<GrantFormValues>({
    resolver: zodResolver(GrantFormSchema),
    defaultValues: {
      grant_name: "",
      grant_description: "",
    },
  });

  async function handleManualSubmit(values: GrantFormValues) {
    try {
      await api.post("/grants", values);
      formMethods.reset();
      setRefreshToken((v) => v + 1);
    } catch (err) {
      console.error(err);
      // Keep it simple and display generic error below the form button
      formMethods.setError("root", {
        type: "server",
        message: "Failed to add grant. Please try again.",
      });
    }
  }

  async function handleJsonFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setJsonUploadError(null);
    setJsonUploadSuccess(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error("JSON root must be an array.");
      }

      const payload = parsed.map((item) => ({
        grant_name: String(item.grant_name ?? "").trim(),
        grant_description: String(item.grant_description ?? "").trim(),
      }));

      await api.post("/grants", payload);
      setJsonUploadSuccess(`Successfully uploaded ${payload.length} grants.`);
      setRefreshToken((v) => v + 1);
    } catch (err) {
      console.error(err);
      setJsonUploadError(
        "Failed to process JSON file. Ensure it matches the expected format."
      );
    } finally {
      // Clear the input so the same file can be re-selected if needed.
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-teal-700 mb-2">Add Grants</h2>
          <p className="text-sm text-gray-600">
            Upload grants via JSON or add a single grant manually.
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">JSON Upload</label>
            <div className="flex items-center gap-4">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleJsonFileChange}
                  className="hidden"
                />
                <span className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                  Choose File
                </span>
              </label>
            </div>
            {jsonUploadError && (
              <p className="text-sm text-red-600 mt-2">{jsonUploadError}</p>
            )}
            {jsonUploadSuccess && (
              <p className="text-sm text-green-600 mt-2">{jsonUploadSuccess}</p>
            )}
            <p className="text-xs text-gray-500">
              Expected format: array of objects with{" "}
              <code className="bg-gray-100 px-1 py-0.5 rounded">grant_name</code> and{" "}
              <code className="bg-gray-100 px-1 py-0.5 rounded">grant_description</code> fields.
              Other fields are ignored.
            </p>
          </div>

          <div className="h-px bg-gray-200" />

          <FormProvider {...formMethods}>
            <Form form={formMethods} onSubmit={handleManualSubmit}>
              <div className="space-y-5">
                <FormField
                  control={formMethods.control}
                  name="grant_name"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">Grant Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter grant name" />
                      </FormControl>
                      {fieldState.error && (
                        <FormMessage className="text-sm text-red-600">{fieldState.error.message}</FormMessage>
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={formMethods.control}
                  name="grant_description"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">Grant Description *</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={6}
                          placeholder="Enter a detailed grant description"
                        />
                      </FormControl>
                      {fieldState.error && (
                        <FormMessage className="text-sm text-red-600">{fieldState.error.message}</FormMessage>
                      )}
                    </FormItem>
                  )}
                />

                {formMethods.formState.errors.root && (
                  <FormMessage className="text-sm text-red-600">
                    {formMethods.formState.errors.root.message}
                  </FormMessage>
                )}

                <Button type="submit" size="lg" className="w-full sm:w-auto">
                  Add Grant
                </Button>
              </div>
            </Form>
          </FormProvider>
        </div>
      </section>

      <section>
        <GrantsTable refreshToken={refreshToken} />
      </section>
    </div>
  );
}


