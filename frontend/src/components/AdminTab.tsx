import { useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../api/client";
import { GrantsTable } from "./GrantsTable";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Spinner } from "./ui/spinner";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "./ui/form";
import { useToast } from "./ui/use-toast";

/**
 * Zod schema for the manual grant entry form.
 *
 * grant_name: Non-empty string for the grant title.
 * grant_description: Non-empty, reasonably sized string describing the grant.
 * website_urls: Optional textarea input, one URL per line. Must be valid website URLs.
 * document_urls: Optional textarea input, one URL per line. Must be valid PDF URLs.
 */
const urlRegex = /^https?:\/\/.+/i;
const pdfUrlRegex = /^https?:\/\/.+\.pdf(\?.*)?$/i;

const GrantFormSchema = z.object({
  grant_name: z
    .string()
    .min(1, "Grant name is required.")
    .max(300, "Grant name is too long."),
  grant_description: z
    .string()
    .min(1, "Grant description is required.")
    .max(8000, "Grant description is too long."),
  website_urls: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || !val.trim()) return true;
        const urls = val
          .split("\n")
          .map((u) => u.trim())
          .filter((u) => u);
        return urls.every((url) => urlRegex.test(url));
      },
      { message: "Each website URL must be a valid HTTP/HTTPS URL." }
    ),
  document_urls: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || !val.trim()) return true;
        const urls = val
          .split("\n")
          .map((u) => u.trim())
          .filter((u) => u);
        return urls.every((url) => pdfUrlRegex.test(url));
      },
      {
        message:
          "Each document URL must be a valid HTTP/HTTPS URL pointing to a PDF file.",
      }
    ),
});

type GrantFormValues = z.infer<typeof GrantFormSchema>;

export function AdminTab() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [jsonUploadError, setJsonUploadError] = useState<string | null>(null);
  const [jsonUploadSuccess, setJsonUploadSuccess] = useState<string | null>(
    null
  );
  const [isUploadingJson, setIsUploadingJson] = useState(false);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  const formMethods = useForm<GrantFormValues>({
    resolver: zodResolver(GrantFormSchema),
    defaultValues: {
      grant_name: "",
      grant_description: "",
      website_urls: "",
      document_urls: "",
    },
  });
  const { toast } = useToast();

  async function handleManualSubmit(values: GrantFormValues) {
    setIsSubmittingManual(true);
    try {
      // Convert textarea strings to arrays, filtering empty lines
      const payload: any = {
        grant_name: values.grant_name,
        grant_description: values.grant_description,
      };

      if (values.website_urls?.trim()) {
        payload.website_urls = values.website_urls
          .split("\n")
          .map((u) => u.trim())
          .filter((u) => u);
      }

      if (values.document_urls?.trim()) {
        payload.document_urls = values.document_urls
          .split("\n")
          .map((u) => u.trim())
          .filter((u) => u);
      }

      await api.post("/grants", payload);
      formMethods.reset();
      setRefreshToken((v) => v + 1);
      toast({
        title: "Success!",
        description: "Grant added successfully.",
        variant: "success",
      });
    } catch (err: any) {
      console.error(err);
      const errorMessage =
        err.response?.data?.error || "Failed to add grant. Please try again.";
      // Update form error message
      formMethods.setError("root", {
        type: "server",
        message: errorMessage,
      });
      toast({
        title: "Error!",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmittingManual(false);
    }
  }

  async function handleJsonFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingJson(true);
    setJsonUploadError(null);
    setJsonUploadSuccess(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error("JSON root must be an array.");
      }

      const payload = parsed.map((item) => {
        const grant: any = {
          grant_name: String(item.grant_name ?? "").trim(),
          grant_description: String(item.grant_description ?? "").trim(),
        };

        // Include website_urls if present (array or convert to array)
        if (item.website_urls) {
          grant.website_urls = Array.isArray(item.website_urls)
            ? item.website_urls
                .map((u: any) => String(u).trim())
                .filter((u: string) => u)
            : [String(item.website_urls).trim()].filter((u: string) => u);
        }

        // Include document_urls if present (array or convert to array)
        if (item.document_urls) {
          grant.document_urls = Array.isArray(item.document_urls)
            ? item.document_urls
                .map((u: any) => String(u).trim())
                .filter((u: string) => u)
            : [String(item.document_urls).trim()].filter((u: string) => u);
        }

        return grant;
      });

      await api.post("/grants", payload);
      setJsonUploadSuccess(`Successfully uploaded ${payload.length} grants.`);
      setRefreshToken((v) => v + 1);
      toast({
        title: "Success!",
        description: `Successfully uploaded ${payload.length} grants.`,
        variant: "success",
      });
    } catch (err: any) {
      console.error(err);
      const errorMessage =
        err.response?.data?.error ||
        "Failed to process JSON file. Ensure it matches the expected format.";
      setJsonUploadError(errorMessage);
      toast({
        title: "Error!",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploadingJson(false);
      // Clear the input so the same file can be re-selected if needed.
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-teal-700 mb-2">
            Add Grants
          </h2>
          <p className="text-sm text-gray-600">
            Upload grants via JSON or add a single grant manually.
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">
              JSON Upload
            </label>
            <div className="flex items-center gap-4">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleJsonFileChange}
                  disabled={isUploadingJson || isSubmittingManual}
                  className="hidden"
                />
                <span
                  className={`inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors shadow-sm ${
                    isUploadingJson || isSubmittingManual
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-gray-50 cursor-pointer"
                  }`}
                >
                  {isUploadingJson && <Spinner size="sm" />}
                  {isUploadingJson ? "Uploading..." : "Choose File"}
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
              <code className="bg-gray-100 px-1 py-0.5 rounded">
                grant_name
              </code>
              ,{" "}
              <code className="bg-gray-100 px-1 py-0.5 rounded">
                grant_description
              </code>
              , and optionally{" "}
              <code className="bg-gray-100 px-1 py-0.5 rounded">
                website_urls
              </code>{" "}
              and{" "}
              <code className="bg-gray-100 px-1 py-0.5 rounded">
                document_urls
              </code>{" "}
              (arrays of URLs).
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
                      <FormLabel className="text-sm font-medium text-gray-700">
                        Grant Name *
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter grant name"
                          disabled={isSubmittingManual || isUploadingJson}
                        />
                      </FormControl>
                      {fieldState.error && (
                        <FormMessage className="text-sm text-red-600">
                          {fieldState.error.message}
                        </FormMessage>
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={formMethods.control}
                  name="grant_description"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">
                        Grant Description *
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={6}
                          placeholder="Enter a detailed grant description"
                          disabled={isSubmittingManual || isUploadingJson}
                        />
                      </FormControl>
                      {fieldState.error && (
                        <FormMessage className="text-sm text-red-600">
                          {fieldState.error.message}
                        </FormMessage>
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={formMethods.control}
                  name="website_urls"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">
                        Website URLs (Optional)
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={3}
                          placeholder="Enter website URLs, one per line (e.g., https://example.com)"
                          disabled={isSubmittingManual || isUploadingJson}
                        />
                      </FormControl>
                      {fieldState.error && (
                        <FormMessage className="text-sm text-red-600">
                          {fieldState.error.message}
                        </FormMessage>
                      )}
                      <p className="text-xs text-gray-500">
                        One URL per line. Must be valid HTTP/HTTPS URLs.
                      </p>
                    </FormItem>
                  )}
                />

                <FormField
                  control={formMethods.control}
                  name="document_urls"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">
                        Document URLs (Optional)
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={3}
                          placeholder="Enter PDF document URLs, one per line (e.g., https://example.com/doc.pdf)"
                          disabled={isSubmittingManual || isUploadingJson}
                        />
                      </FormControl>
                      {fieldState.error && (
                        <FormMessage className="text-sm text-red-600">
                          {fieldState.error.message}
                        </FormMessage>
                      )}
                      <p className="text-xs text-gray-500">
                        One URL per line. Must be valid HTTP/HTTPS URLs pointing
                        to PDF files.
                      </p>
                    </FormItem>
                  )}
                />

                {formMethods.formState.errors.root && (
                  <FormMessage className="text-sm text-red-600">
                    {formMethods.formState.errors.root.message}
                  </FormMessage>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={isSubmittingManual || isUploadingJson}
                >
                  {isSubmittingManual ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Adding Grant...
                    </>
                  ) : (
                    "Add Grant"
                  )}
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
