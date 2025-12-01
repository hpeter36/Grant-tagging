import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";

export interface GrantDTO {
  grant_name: string;
  grant_description: string;
  tags: string[];
}

interface GrantsTableProps {
  /** Used to force refetch when admin adds new grants. */
  refreshToken?: number;
}

export function GrantsTable({ refreshToken = 0 }: GrantsTableProps) {
  const [grants, setGrants] = useState<GrantDTO[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [explicitlySelectedTags, setExplicitlySelectedTags] = useState<
    string[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagFilterInput, setTagFilterInput] = useState("");
  const [includeSynonyms, setIncludeSynonyms] = useState(false);

  async function fetchTags() {
    try {
      const res = await api.get<{ tags: string[] }>("/tags");
      setAllTags(res.data.tags);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchGrants(currentTags: string[] = selectedTags) {
    setLoading(true);
    setError(null);
    try {
      // Add include_synonyms back to params for the grants API call
      const params: { tags?: string; include_synonyms?: "true" } = {};
      if (currentTags.length > 0) {
        params.tags = currentTags.join(",");
      }
      if (includeSynonyms) {
        // Send this parameter if checkbox is selected
        params.include_synonyms = "true";
      }

      const res = await api.get<{ grants: GrantDTO[] }>("/grants", {
        params,
      });
      setGrants(res.data.grants);
    } catch (err) {
      console.error(err);
      setError("Failed to load grants.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchEffectiveTags(
    baseTags: string[],
    shouldIncludeSynonyms: boolean
  ) {
    if (!baseTags.length && !shouldIncludeSynonyms) {
      setSelectedTags([]);
      return;
    }

    try {
      const params: { tags?: string; include_synonyms?: "true" } = {};
      if (baseTags.length > 0) {
        params.tags = baseTags.join(",");
      }
      if (shouldIncludeSynonyms) {
        params.include_synonyms = "true";
      }

      const res = await api.get<{ effective_tags: string[] }>(
        "/tags/effective_tags",
        {
          params,
        }
      );
      setSelectedTags(res.data.effective_tags);
    } catch (err) {
      console.error("Failed to fetch effective tags:", err);
      setSelectedTags(baseTags); // Fallback to base tags on error
    }
  }

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    fetchEffectiveTags(explicitlySelectedTags, includeSynonyms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explicitlySelectedTags.join(","), includeSynonyms]); // Depend on explicitlySelectedTags and includeSynonyms

  useEffect(() => {
    fetchGrants();
    // Re-fetch when refreshToken, selectedTags, or includeSynonyms changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken, selectedTags.join(",")]);

  function toggleTag(tag: string) {
    setExplicitlySelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  const filteredSelectableTags = allTags.filter((t) =>
    t.toLowerCase().includes(tagFilterInput.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header section at the top */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-teal-700">
          Grants ({grants.length})
        </h2>
        <p className="text-sm text-gray-600">
          Filter by tags to narrow down relevant grants.
        </p>
      </div>

      {/* Filter section below header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input
          placeholder="Search tags..."
          value={tagFilterInput}
          onChange={(e) => setTagFilterInput(e.target.value)}
          className="w-full lg:w-48"
        />
        <div className="flex items-center space-x-2">
          <Checkbox
            id="include-synonyms"
            checked={includeSynonyms}
            onCheckedChange={(checked) => setIncludeSynonyms(checked === true)}
          />
          <label
            htmlFor="include-synonyms"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Select synonyms
          </label>
        </div>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50 w-full lg:w-auto lg:max-w-md">
          {filteredSelectableTags.length === 0 ? (
            <p className="text-xs text-gray-500">No tags found</p>
          ) : (
            filteredSelectableTags.map((tag) => {
              const isExplicitlySelected = explicitlySelectedTags.includes(tag);
              // A tag is highlighted as a synonym if it's in the `selectedTags` (effective tags)
              // but not among the `explicitlySelectedTags`, AND the synonym checkbox is active.
              const isSynonymHighlighted = includeSynonyms && selectedTags.includes(tag) && !isExplicitlySelected;

              let buttonVariant: "default" | "outline" = "outline"; // Default button style
              let buttonClasses = "text-xs"; // Base classes for the button

              if (isExplicitlySelected) {
                buttonVariant = "default"; // Explicitly selected tags use the default variant
              } else if (isSynonymHighlighted) {
                // If it's a synonym-highlighted tag (not explicitly selected), apply custom styles.
                // Using a light blue background and darker text for distinction.
                buttonClasses += " bg-blue-100 text-blue-800 hover:bg-blue-200";
              }

              return (
                <Button
                  key={tag}
                  type="button"
                  variant={buttonVariant}
                  size="sm"
                  onClick={() => toggleTag(tag)}
                  className={buttonClasses}
                >
                  {tag}
                </Button>
              );
            })
          )}
        </div>
        {selectedTags.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSelectedTags([]);
              setExplicitlySelectedTags([]);
            }}
            className="text-sm"
          >
            Clear filters
          </Button>
        )}
      </div>

      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-600">Loading grants...</p>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                  Grant Name
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                  Grant Description
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                  Tags
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {grants.map((grant) => (
                <tr
                  key={`${grant.grant_name}-${grant.grant_description.slice(
                    0,
                    20
                  )}`}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 align-top">
                    <div className="font-medium text-gray-900">
                      {grant.grant_name}
                    </div>
                  </td>
                  <td className="px-6 py-4 align-top max-w-2xl">
                    <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {grant.grant_description}
                    </div>
                  </td>
                  <td className="px-6 py-4 align-top">
                    <div className="flex flex-wrap gap-2">
                      {grant.tags.length === 0 ? (
                        <span className="text-xs text-gray-400">No tags</span>
                      ) : (
                        grant.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-full bg-teal-100 text-teal-700 px-3 py-1 text-xs font-medium"
                          >
                            {tag}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {grants.length === 0 && (
                <tr>
                  <td
                    className="px-6 py-12 text-center text-sm text-gray-500"
                    colSpan={3}
                  >
                    No grants found.{" "}
                    {selectedTags.length > 0 && "Try adjusting your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
