import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagFilterInput, setTagFilterInput] = useState("");

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
      const params =
        currentTags.length > 0
          ? { tags: currentTags.join(",") }
          : undefined;
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

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    fetchGrants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken, selectedTags.join(",")]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
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
        <h2 className="text-xl font-semibold text-teal-700">Grants</h2>
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
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50 w-full lg:w-auto lg:max-w-md">
          {filteredSelectableTags.length === 0 ? (
            <p className="text-xs text-gray-500">No tags found</p>
          ) : (
            filteredSelectableTags.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <Button
                  key={tag}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleTag(tag)}
                  className="text-xs"
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
            onClick={() => setSelectedTags([])}
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
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Grant Name</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                  Grant Description
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Tags</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {grants.map((grant) => (
                <tr
                  key={`${grant.grant_name}-${grant.grant_description.slice(0, 20)}`}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 align-top">
                    <div className="font-medium text-gray-900">{grant.grant_name}</div>
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
                  <td className="px-6 py-12 text-center text-sm text-gray-500" colSpan={3}>
                    No grants found. {selectedTags.length > 0 && "Try adjusting your filters."}
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


