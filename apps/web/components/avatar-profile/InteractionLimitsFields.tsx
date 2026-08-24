"use client";

import React from "react";
import { FormField, Input, Select } from "@yuni/ui";
import type { InteractionLimitsDraft } from "../../lib/avatar-sharing";
import styles from "./AvatarShareTab.module.css";

export type InteractionLimitErrors = Record<keyof InteractionLimitsDraft, string | null>;

export function InteractionLimitsFields({
  draft,
  errors,
  onChange,
  idPrefix = "interaction-limits",
}: {
  draft: InteractionLimitsDraft;
  errors: InteractionLimitErrors;
  onChange: (field: keyof InteractionLimitsDraft, value: string) => void;
  idPrefix?: string;
}) {
  function updateNumericField(field: "sessionDuration" | "maxSessionsPer24Hours", value: string) {
    if (/^\d*$/.test(value)) {
      onChange(field, value);
    }
  }

  return (
    <fieldset className={styles.limitsFieldset}>
      <legend>Límites de uso (opcional)</legend>
      <p>Dejá un campo vacío para permitir uso ilimitado en esa dimensión.</p>
      <div className={styles.limitsGrid}>
        <FormField
          label="Duración por llamada"
          htmlFor={`${idPrefix}-duration`}
          error={errors.sessionDuration}
          hint={draft.sessionDurationUnit === "seconds" ? "Entre 10 y 3600 segundos" : "Entre 1 y 60 minutos"}
        >
          <div className={styles.durationField}>
            <Input
              id={`${idPrefix}-duration`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="off"
              value={draft.sessionDuration}
              placeholder="Ilimitado"
              invalid={Boolean(errors.sessionDuration)}
              onChange={(event) => updateNumericField("sessionDuration", event.target.value)}
            />
            <Select
              aria-label="Unidad de duración"
              value={draft.sessionDurationUnit}
              onValueChange={(value) =>
                onChange("sessionDurationUnit", value as InteractionLimitsDraft["sessionDurationUnit"])
              }
            >
              <option value="seconds">Segundos</option>
              <option value="minutes">Minutos</option>
            </Select>
          </div>
        </FormField>
        <FormField
          label="Llamadas cada 24 h"
          htmlFor={`${idPrefix}-sessions`}
          error={errors.maxSessionsPer24Hours}
          hint="Entre 1 y 100"
        >
          <Input
            id={`${idPrefix}-sessions`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            autoComplete="off"
            value={draft.maxSessionsPer24Hours}
            placeholder="Ilimitado"
            invalid={Boolean(errors.maxSessionsPer24Hours)}
            onChange={(event) => updateNumericField("maxSessionsPer24Hours", event.target.value)}
          />
        </FormField>
      </div>
    </fieldset>
  );
}
