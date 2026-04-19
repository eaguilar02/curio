import React from "react";
import ReactDOM from "react-dom/client";
import './registry';
import FlowProvider from "./providers/FlowProvider";
import TemplateProvider from "./providers/TemplateProvider";
import UserProvider from "./providers/UserProvider";
import DialogProvider from "./providers/DialogProvider";
import { BackendHealthBanner } from "./providers/BackendHealthBanner";
import { MainCanvas } from "./components/MainCanvas";
import { ReactFlowProvider } from "reactflow";
import ProvenanceProvider from "./providers/ProvenanceProvider";
import LLMProvider from "./providers/LLMProvider";
import { LoggingProvider } from "./logging/LoggingContext";
import { useFlowContext } from "./providers/FlowProvider";
import { SnapshotManager } from "./logging/SnapshotManager";

// Expose for manual console use: SnapshotManager.takeSnapshot()
(window as any).SnapshotManager = SnapshotManager;

const LoggingProviderWithGraph: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { getGraphState, workflowNameRef } = useFlowContext();

  return (
    <LoggingProvider
      workflowId={null}
      workflowName={workflowNameRef.current}
      userId={1}
      getGraphState={getGraphState}
    >
      {children}
    </LoggingProvider>
  );
};

const App: React.FC = () => {
  return (
    <BackendHealthBanner>
      <ReactFlowProvider>
        <LLMProvider>
          <ProvenanceProvider>
            <UserProvider>
              <DialogProvider>
                <FlowProvider>
                  <TemplateProvider>
                    <LoggingProviderWithGraph>
                      <MainCanvas />
                    </LoggingProviderWithGraph>
                  </TemplateProvider>
                </FlowProvider>
              </DialogProvider>
            </UserProvider>
          </ProvenanceProvider>
        </LLMProvider>
      </ReactFlowProvider>
    </BackendHealthBanner>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />
);