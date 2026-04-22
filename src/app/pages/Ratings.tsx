// File purpose:
// Ratings page for viewing and leaving review feedback.
// Keeps the trust and reputation flow separate from chat and profile details.

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Textarea } from "../components/ui/textarea";
import { toast } from "../components/ui/sonner";

export function Ratings() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

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
            <CardDescription>Share feedback for user {userId ?? "unknown"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} onClick={() => setRating(value)} type="button">
                  <Star
                    className={`h-10 w-10 ${
                      value <= rating ? "fill-[var(--brand-gold)] text-[var(--brand-gold)]" : "text-[var(--border-strong)]"
                    }`}
                  />
                </button>
              ))}
            </div>

            <Textarea
              onChange={(event) => setComment(event.target.value)}
              placeholder="What went well? Anything that could be improved?"
              rows={5}
              value={comment}
            />

            <Button
              className="w-full"
              onClick={() => {
                toast.success("Thanks for submitting your rating!");
                navigate("/");
              }}
              size="lg"
            >
              Submit Rating
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
