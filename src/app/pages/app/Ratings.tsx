// File purpose:
// Ratings page for viewing and leaving review feedback.
// Loads the real request participant, persists the rating, and prevents blind ratings.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Textarea } from "../../components/ui/textarea";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/ui/sonner";

export function Ratings() {
  const navigate = useNavigate();
  const { requestId } = useParams();
  const { token } = useAuth();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [targetName, setTargetName] = useState("this user");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [canRate, setCanRate] = useState(false);

  useEffect(() => {
    async function loadRatingSummary() {
      if (!token || !requestId) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.getRatingSummary(token, requestId);
        setCanRate(response.canRate);
        setTargetName(response.targetUser?.name || "this user");

        if (response.existingRating) {
          setRating(response.existingRating.rating);
          setComment(response.existingRating.comment || "");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load rating details.");
      } finally {
        setLoading(false);
      }
    }

    void loadRatingSummary();
  }, [requestId, token]);

  async function handleSubmit() {
    if (!token || !requestId || !canRate) return;

    try {
      setSubmitting(true);
      const response = await api.submitRating(token, requestId, {
        rating,
        comment: comment.trim(),
      });
      toast.success(`Rating saved for ${response.targetUser.name}.`);
      navigate(-1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your rating.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Button className="mb-4" onClick={() => navigate(-1)} variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Rate your experience</CardTitle>
            <CardDescription>
              {loading ? "Loading the other person from this request..." : `Share feedback for ${targetName}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!loading && !canRate ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
                This request does not have another participant to rate yet. Once a courier accepts the job, you can come back here.
              </div>
            ) : null}

            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button disabled={!canRate || loading || submitting} key={value} onClick={() => setRating(value)} type="button">
                  <Star
                    className={`h-10 w-10 ${
                      value <= rating ? "fill-[var(--brand-gold)] text-[var(--brand-gold)]" : "text-[var(--border-strong)]"
                    } ${!canRate || loading ? "opacity-50" : ""}`}
                  />
                </button>
              ))}
            </div>

            <Textarea
              disabled={!canRate || loading || submitting}
              onChange={(event) => setComment(event.target.value)}
              placeholder="What went well? Anything that could be improved?"
              rows={5}
              value={comment}
            />

            <Button className="w-full" disabled={!canRate || loading || submitting} onClick={() => void handleSubmit()} size="lg">
              {submitting ? "Saving Rating..." : "Submit Rating"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
