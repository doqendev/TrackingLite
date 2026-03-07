"use client";

import { useEffect, useState } from "react";

export function LiveClock() {
  const [time, setTime] = useState("00:00:00");

  useEffect(() => {
    function updateTime() {
      const now = new Date();
      setTime(now.toISOString().split("T")[1].split(".")[0]);
    }
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return <span>{time}</span>;
}
