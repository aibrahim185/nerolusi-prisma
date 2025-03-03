import { Button } from "~/app/_components/ui/button";
import ErrorPage from "~/app/error";
import LoadingPage from "~/app/loading";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";

const TryoutList = ({ classId }) => {
  const router = useRouter();

  const {
    data: packages,
    isLoading,
    isError,
  } = api.package.getTryoutPackages.useQuery({ classId });

  return isError ? (
    <ErrorPage />
  ) : isLoading ? (
    <LoadingPage />
  ) : (
    <div className="flex flex-col items-center gap-4">
      <h1 className="text-2xl font-bold">Tryout List</h1>
      <p>Select a tryout package to start</p>
      <div className="flex flex-col gap-4">
        {packages?.map((pkg) => (
          <Button
            key={pkg.id}
            variant="ghost"
            onClick={() => {
              router.push(`/tryout/${pkg.id}`);
            }}
            className="flex size-fit min-h-32 w-full min-w-72 flex-col border bg-slate-300 p-3"
          >
            <h3 className="text-2xl font-bold">{pkg.name}</h3>
            {pkg.TOstart && (
              <p
                className={`${new Date(pkg.TOend) < new Date() ? "hidden" : ""}`}
              >
                Start Date: {pkg.TOstart.toLocaleString()}
              </p>
            )}
            {pkg.TOend && (
              <p
                className={`${new Date(pkg.TOend) < new Date() ? "hidden" : ""}`}
              >
                End Date: {pkg.TOend.toLocaleString()}
              </p>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
};
export default TryoutList;
