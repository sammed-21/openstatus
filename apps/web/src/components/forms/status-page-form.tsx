"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import type { PutBlobResult } from "@vercel/blob";
import { useForm } from "react-hook-form";
import type * as z from "zod";

import type { allMonitorsExtendedSchema } from "@openstatus/db/src/schema";
import { insertPageSchemaWithMonitors } from "@openstatus/db/src/schema";
import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  InputWithAddons,
} from "@openstatus/ui";

import { useDebounce } from "@/hooks/use-debounce";
import { useToastAction } from "@/hooks/use-toast-action";
import useUpdateSearchParams from "@/hooks/use-update-search-params";
import { slugify } from "@/lib/utils";
import { api } from "@/trpc/client";
import { LoadingAnimation } from "../loading-animation";

// REMINDER: only use the props you need!

type Schema = z.infer<typeof insertPageSchemaWithMonitors>;

interface Props {
  defaultValues?: Schema;
  workspaceSlug: string;
  allMonitors?: z.infer<typeof allMonitorsExtendedSchema>;
  /**
   * gives the possibility to check all the monitors
   */
  checkAllMonitors?: boolean;
  /**
   * on submit, allows to push a url
   */
  nextUrl?: string;
}

export function StatusPageForm({
  defaultValues,
  workspaceSlug,
  allMonitors,
  checkAllMonitors,
  nextUrl,
}: Props) {
  const form = useForm<Schema>({
    resolver: zodResolver(insertPageSchemaWithMonitors),
    defaultValues: {
      title: defaultValues?.title || "",
      slug: defaultValues?.slug || "",
      description: defaultValues?.description || "",
      workspaceId: defaultValues?.workspaceId || 0,
      id: defaultValues?.id || 0,
      monitors:
        checkAllMonitors && allMonitors
          ? allMonitors.map(({ id }) => id)
          : defaultValues?.monitors ?? [],
      customDomain: defaultValues?.customDomain || "",
      workspaceSlug: "",
      icon: defaultValues?.icon || "",
    },
  });
  const router = useRouter();
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const watchSlug = form.watch("slug");
  const watchTitle = form.watch("title");
  const debouncedSlug = useDebounce(watchSlug, 1000); // using debounce to not exhaust the server
  const { toast } = useToastAction();
  const updateSearchParams = useUpdateSearchParams();

  const checkUniqueSlug = useCallback(async () => {
    const isUnique = await api.page.getSlugUniqueness.query({
      slug: debouncedSlug,
    });
    return (
      isUnique ||
      debouncedSlug.toLowerCase() === defaultValues?.slug.toLowerCase()
    );
  }, [debouncedSlug, defaultValues?.slug]);

  useEffect(() => {
    async function watchSlugChanges() {
      const isUnique = await checkUniqueSlug();
      if (!isUnique) {
        form.setError("slug", {
          message: "Already taken. Please select another slug.",
        });
      } else {
        form.clearErrors("slug");
      }
    }

    void watchSlugChanges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkUniqueSlug]);

  useEffect(() => {
    if (!defaultValues?.title) {
      form.setValue("slug", slugify(watchTitle));
    }
  }, [watchTitle, form, defaultValues?.title]);

  const onSubmit = async ({
    ...props
  }: z.infer<typeof insertPageSchemaWithMonitors>) => {
    startTransition(async () => {
      // TODO: we could use an upsertPage function instead - insert if not exist otherwise update
      try {
        if (defaultValues) {
          await api.page.updatePage.mutate(props);
        } else {
          const page = await api.page.createPage.mutate({
            ...props,
            workspaceSlug,
          });
          const id = page?.id || null;
          router.replace(`?${updateSearchParams({ id })}`); // to stay on same page and enable 'Advanced' tab
        }
        toast("saved");
        if (nextUrl) {
          router.push(nextUrl);
        }
        router.refresh();
      } catch {
        toast("error");
      }
    });
  };

  const handleChange = async (file: FileList | null) => {
    if (!file || file.length === 0) {
      return;
    }

    console.log(file[0]);
    const response = await fetch(`/api/upload?filename=${file[0].name}`, {
      method: "POST",
      body: file[0],
    });

    const newblob = (await response.json()) as PutBlobResult;
    console.log(newblob.url);
    form.setValue("icon", newblob.url);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const isUnique = await checkUniqueSlug();
          if (!isUnique) {
            // the user will already have the "error" message - we include a toast as well
            toast("unique-slug");
          } else {
            if (onSubmit) {
              void form.handleSubmit(onSubmit)(e);
            }
          }
        }}
        className="grid w-full grid-cols-1 items-center gap-6 sm:grid-cols-6"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem className="sm:col-span-4">
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Documenso Status" {...field} />
              </FormControl>
              <FormDescription>The title of your page.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem className="sm:col-span-5">
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input
                  placeholder="Stay informed about our api and website health."
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Provide your users informations about it.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem className="sm:col-span-3">
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <InputWithAddons
                  placeholder="documenso"
                  trailing={".openstatus.dev"}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                The subdomain for your status page. At least 3 chars.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="icon"
          render={({ field }) => (
            <FormItem className="sm:col-span-3">
              <FormLabel>Favicon</FormLabel>
              <FormControl>
                <>
                  {!field.value && (
                    <Input
                      type="file"
                      accept="image/x-icon,image/png"
                      ref={inputFileRef}
                      onChange={(e) => handleChange(e.target.files)}
                    />
                  )}
                  {field.value && (
                    <div className="flex items-center">
                      <div className="border-border h-10 w-10 rounded-sm border p-1">
                        <Image
                          src={field.value}
                          width={64}
                          height={64}
                          alt="Favicon"
                        />
                      </div>
                      <Button
                        variant="link"
                        onClick={() => {
                          form.setValue("icon", "");
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </>
              </FormControl>
              <FormDescription>Your status page favicon</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="monitors"
          render={() => (
            <FormItem className="sm:col-span-full">
              <div className="mb-4">
                <FormLabel className="text-base">Monitor</FormLabel>
                <FormDescription>
                  Select the monitors you want to display.
                </FormDescription>
              </div>
              {allMonitors?.map((item) => (
                <FormField
                  key={item.id}
                  control={form.control}
                  name="monitors"
                  render={({ field }) => {
                    return (
                      <FormItem
                        key={item.id}
                        className="flex flex-row items-start space-x-3 space-y-0"
                      >
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(item.id)}
                            onCheckedChange={(checked) => {
                              return checked
                                ? field.onChange([
                                    ...(field.value || []),
                                    item.id,
                                  ])
                                : field.onChange(
                                    field.value?.filter(
                                      (value) => value !== item.id,
                                    ),
                                  );
                            }}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="font-normal">
                            {item.name}
                          </FormLabel>
                          <FormDescription>{item.url}</FormDescription>
                        </div>
                      </FormItem>
                    );
                  }}
                />
              ))}
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="sm:col-span-full">
          <Button className="w-full sm:w-auto" size="lg">
            {!isPending ? "Confirm" : <LoadingAnimation />}
          </Button>
        </div>
      </form>
    </Form>
  );
}
