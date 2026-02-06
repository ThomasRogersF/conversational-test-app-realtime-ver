import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ScenarioIndexEntry } from "@ai-tutor/shared";

export function ScenarioMenu() {
  const [scenarios, setScenarios] = useState<ScenarioIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/scenarios")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ScenarioIndexEntry[]) => {
        setScenarios(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleSelect = (id: string) => {
    navigate(`/call?scenario=${encodeURIComponent(id)}`);
  };

  return (
    <div className="container scenario-menu">
      <h1>AI Language Tutor</h1>
      <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.9rem" }}>
        Choose a lesson scenario to begin
      </p>

      {loading && (
        <p style={{ textAlign: "center", color: "#64748b" }}>
          Loading scenarios...
        </p>
      )}

      {error && (
        <p style={{ textAlign: "center", color: "#ef4444" }}>
          Error: {error}
        </p>
      )}

      {scenarios.map((s) => (
        <div
          key={s.id}
          className="scenario-card"
          onClick={() => handleSelect(s.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleSelect(s.id)}
        >
          <span className="level">{s.level}</span>
          <div className="title">{s.title}</div>
        </div>
      ))}
    </div>
  );
}
