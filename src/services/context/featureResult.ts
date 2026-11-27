import type {
  ContextUnit,
  FeatureComputeRequest,
  FeatureInputRef,
  FeatureReasonCode,
  FeatureResult,
  FeatureStatus,
} from "@/types/context";

export function featureResult(args: {
  featureKey: string;
  definitionVersion: string;
  unit: ContextUnit;
  request: FeatureComputeRequest;
  value: number | null;
  status: FeatureStatus;
  reasonCode: FeatureReasonCode;
  inputRefs?: readonly FeatureInputRef[];
  detail?: string;
}): FeatureResult {
  return {
    featureKey: args.featureKey,
    definitionVersion: args.definitionVersion,
    value: args.status === "ok" ? args.value : null,
    unit: args.unit,
    status: args.status,
    reasonCode: args.reasonCode,
    cutoff: args.request.cutoff,
    knowledgeMode: args.request.knowledgeMode,
    inputRefs: args.inputRefs ?? [],
    detail: args.detail,
  };
}
